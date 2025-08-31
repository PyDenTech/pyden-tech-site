// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

dotenv.config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 4000);

// ---------- Segurança básica ----------
app.use(helmet({
  contentSecurityPolicy: false, // (simplificado para permitir nossos assets locais)
}));
app.disable('x-powered-by');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// ---------- Sessão com persistência em SQLite ----------
app.set('trust proxy', 1);
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',           // <- ajusta conforme HTTP/HTTPS automaticamente
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// ---------- Banco de Dados (SQLite) ----------
const dbFile = path.join(__dirname, 'data', 'app.sqlite3');
const db = new sqlite3.Database(dbFile);

// Tabelas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      given_id TEXT NOT NULL,
      uid TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (tipo, given_id)
    );
  `);

  // Usuário inicial (se não existir)
  const email = 'pydentech@gmail.com';
  const plain = 'PyDen-2801';
  const hash = bcrypt.hashSync(plain, 12);

  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('Erro ao verificar usuário inicial:', err);
      return;
    }
    if (!row) {
      db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash], (e) => {
        if (e) console.error('Erro ao criar usuário inicial:', e);
        else console.log('Usuário admin inicial criado:', email);
      });
    }
  });
});

// ---------- Helpers ----------
function normalizeTipo(t) {
  if (!t) return '';
  const s = t.toString().trim().toLowerCase();
  // normaliza acentos simples
  return s
    .replace(/[ç]/g, 'c')
    .replace(/[áàâã]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[íìî]/g, 'i')
    .replace(/[óòôõ]/g, 'o')
    .replace(/[úùû]/g, 'u');
}

const TIPOS_PERMITIDOS = new Set(['contratos', 'orcamentos', 'propostas']);

function ensureAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/admin/login');
}

// ---------- Arquivos estáticos ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Rotas de Autenticação (/admin) ----------
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.post('/admin/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).send('Credenciais obrigatórias.');
  }
  db.get('SELECT id, password_hash FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('Erro DB login:', err);
      return res.status(500).send('Erro interno.');
    }
    if (!row) return res.status(401).send('Credenciais inválidas.');
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).send('Credenciais inválidas.');
    req.session.userId = row.id;
    req.session.email = email;
    return res.redirect('/admin');
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

app.get('/admin', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

// ---------- API QR Codes ----------
fs.mkdirSync(path.join(__dirname, 'public', 'img', 'qrcodes'), { recursive: true });

// Criar
app.post('/api/qrcodes', apiLimiter, ensureAuth, async (req, res) => {
  try {
    let { tipo, descricao, id } = req.body || {};
    if (!tipo || !descricao || !id) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, descricao, id.' });
    }

    tipo = normalizeTipo(tipo);
    if (!TIPOS_PERMITIDOS.has(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use contratos, orcamentos ou propostas.' });
    }

    const given_id = id.toString().trim();
    const uid = uuidv4(); // identificador único de validação pública
    const validationUrl = `${BASE_URL.replace(/\/$/, '')}/validar/${uid}`;

    // tenta inserir (UNIQUE (tipo, given_id))
    db.run(
      'INSERT INTO qrcodes (tipo, descricao, given_id, uid) VALUES (?, ?, ?, ?)',
      [tipo, descricao.trim(), given_id, uid],
      async function (err) {
        if (err) {
          if (err.message && err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Já existe QR para este tipo + id.' });
          }
          console.error('Erro ao inserir QR:', err);
          return res.status(500).json({ error: 'Erro interno ao salvar QR.' });
        }

        // gera PNG do QR
        const pngPath = path.join(__dirname, 'public', 'img', 'qrcodes', `${uid}.png`);
        const qrOpts = { errorCorrectionLevel: 'M', width: 600, margin: 2 };

        await QRCode.toFile(pngPath, validationUrl, qrOpts);

        return res.status(201).json({
          ok: true,
          record: {
            id: this.lastID,
            tipo,
            descricao: descricao.trim(),
            given_id,
            uid,
            validation_url: validationUrl,
            qr_image_url: `/img/qrcodes/${uid}.png`
          }
        });
      }
    );
  } catch (e) {
    console.error('Erro /api/qrcodes:', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// Listar (com filtro opcional)
app.get('/api/qrcodes', apiLimiter, ensureAuth, (req, res) => {
  const { tipo, search } = req.query || {};
  let sql = 'SELECT id, tipo, descricao, given_id, uid, created_at FROM qrcodes';
  const params = [];
  const conds = [];

  if (tipo) {
    conds.push('tipo = ?');
    params.push(normalizeTipo(tipo));
  }
  if (search) {
    conds.push('(descricao LIKE ? OR given_id LIKE ? OR uid LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT 200';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Erro listar QRs:', err);
      return res.status(500).json({ error: 'Erro interno.' });
    }
    return res.json({ data: rows });
  });
});

// ---------- Rota pública de validação ----------
app.get('/validar/:uid', (req, res) => {
  const { uid } = req.params;
  db.get('SELECT tipo, descricao, given_id, created_at FROM qrcodes WHERE uid = ?', [uid], (err, row) => {
    if (err) {
      console.error('Erro validar:', err);
      return res.status(500).send('Erro interno.');
    }
    if (!row) {
      res.status(404);
      return res.send(`
        <!doctype html>
        <html lang="pt-br"><head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Validação - Não encontrado</title>
          <style>body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:2rem;color:#333} .card{max-width:720px;margin:auto;border:1px solid #eee;border-radius:12px;padding:24px;box-shadow:0 6px 20px rgba(0,0,0,.06)} .muted{color:#666}</style>
        </head><body>
          <div class="card">
            <h1>Documento não encontrado</h1>
            <p class="muted">O identificador fornecido não corresponde a um documento válido nos registros da PyDen Technologies.</p>
          </div>
        </body></html>
      `);
    }
    // encontrado
    const qrUrl = `/img/qrcodes/${uid}.png`;
    return res.send(`
      <!doctype html>
      <html lang="pt-br"><head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Validação de Documento</title>
        <style>
          body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:2rem;color:#222;background:#fafafa}
          .card{max-width:880px;margin:auto;background:#fff;border:1px solid #eee;border-radius:14px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.07)}
          .grid{display:grid;grid-template-columns:2fr 1fr;gap:24px}
          .muted{color:#666}
          .tag{display:inline-block;padding:6px 10px;border-radius:999px;background:#eef;border:1px solid #dde;font-size:.82rem}
          img{max-width:100%;height:auto;border:1px solid #eee;border-radius:12px}
          .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace}
        </style>
      </head><body>
        <div class="card">
          <h1>Validação de Documento</h1>
          <p class="muted">PyDen Technologies LTDA • CNPJ 57.604.330/0001-03</p>
          <div class="grid">
            <div>
              <p><span class="tag">Status: Válido</span></p>
              <p><strong>Tipo:</strong> ${row.tipo}</p>
              <p><strong>ID informado:</strong> <span class="mono">${row.given_id}</span></p>
              <p><strong>Descrição:</strong> ${row.descricao}</p>
              <p><strong>Cadastrado em:</strong> ${row.created_at}</p>
              <p class="muted">Este registro foi gerado e assinado digitalmente pelos sistemas da PyDen Technologies. Para dúvidas, acesse <a href="https://pyden.tech" target="_blank" rel="noopener">pyden.tech</a>.</p>
            </div>
            <div>
              <img src="${qrUrl}" alt="QR Code" />
            </div>
          </div>
        </div>
      </body></html>
    `);
  });
});

// ---------- Rota de contato (mantida do seu código) ----------
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, project, subject, message } = req.body;

  if (!name || !email || !phone || !subject || !message) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos obrigatórios.' });
  }

  let transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT == '465',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    logger: true,
    debug: true
  });

  let mailOptions = {
    from: `"${name}" <${process.env.EMAIL_USER}>`,
    replyTo: email,
    to: process.env.EMAIL_USER,
    subject: subject,
    text: `
      Você recebeu uma nova mensagem do formulário de contato:

      Nome: ${name}
      Email: ${email}
      Telefone: ${phone}
      Projeto: ${project}
      Assunto: ${subject}

      Mensagem:
      ${message}
    `,
    html: `
      <p>Você recebeu uma nova mensagem do formulário de contato:</p>
      <ul>
        <li><strong>Nome:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Telefone:</strong> ${phone}</li>
        <li><strong>Projeto:</strong> ${project}</li>
        <li><strong>Assunto:</strong> ${subject}</li>
      </ul>
      <p><strong>Mensagem:</strong></p>
      <p>${message}</p>
    `
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('✅ Mensagem enviada. messageId:', info.messageId);
    console.log('✔ Resposta do servidor:', info.response);
    return res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
  } catch (err) {
    console.error('❌ Erro ao enviar email:', err);
    return res.status(500).json({ error: 'Erro ao enviar. Tente mais tarde.' });
  }
});

// ---------- Catch-all (depois de TODAS as rotas acima) ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Inicialização ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Admin: ${BASE_URL}/admin (login requerido)`);
});
