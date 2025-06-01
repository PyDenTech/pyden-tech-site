// server.js
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');

dotenv.config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota para todas as páginas (suporte a SPA se necessário)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para lidar com o envio do formulário de contato
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, project, subject, message } = req.body;

  // Validação simples
  if (!name || !email || !phone || !subject || !message) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos obrigatórios.' });
  }

  // Configurar o transporter do Nodemailer
  let transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Configurar o email
  let mailOptions = {
    from: `"${name}" <${email}>`, // Remetente
    to: process.env.EMAIL_USER, // Destinatário (seu email)
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

  // Enviar o email
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    res.status(500).json({ error: 'Ocorreu um erro ao enviar sua mensagem. Por favor, tente novamente mais tarde.' });
  }
});

// Define a porta
const PORT = process.env.PORT || 4000;

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
