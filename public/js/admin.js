(function () {
    const $ = (sel) => document.querySelector(sel);
    const tbody = $('#tbl tbody');

    async function listar(q = '') {
        const url = q ? `/api/qrcodes?search=${encodeURIComponent(q)}` : '/api/qrcodes';
        const r = await fetch(url);
        const j = await r.json();
        tbody.innerHTML = '';
        (j.data || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><span class="badge">${row.tipo}</span></td>
        <td class="mono">${row.given_id}</td>
        <td>${row.descricao}</td>
        <td class="mono" title="${row.uid}">${row.uid.slice(0, 8)}…</td>
        <td class="mono">${row.created_at}</td>
        <td><a href="/img/qrcodes/${row.uid}.png" target="_blank">PNG</a> • <a href="/validar/${row.uid}" target="_blank">Validar</a></td>
      `;
            tbody.appendChild(tr);
        });
    }

    $('#btnBuscar').addEventListener('click', () => {
        const q = $('#search').value.trim();
        listar(q);
    });

    $('#qrForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipo = $('#tipo').value;
        const given_id = $('#given_id').value.trim();
        const descricao = $('#descricao').value.trim();
        const out = $('#result');
        out.textContent = 'Gerando...';

        try {
            const r = await fetch('/api/qrcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, id: given_id, descricao })
            });
            const j = await r.json();
            if (!r.ok) {
                out.textContent = j.error || 'Erro ao gerar QR.';
                return;
            }
            out.innerHTML = `
        <div class="ok">QR gerado com sucesso.</div>
        <div style="margin-top:10px">
          <div><strong>URL de validação:</strong> <a class="mono" href="${j.record.validation_url}" target="_blank">${j.record.validation_url}</a></div>
          <div style="margin-top:8px"><img src="${j.record.qr_image_url}" alt="QR" style="max-width:200px;border-radius:12px;border:1px solid #1f2a3a"/></div>
        </div>
      `;
            await listar('');
            $('#qrForm').reset();
        } catch (e) {
            console.error(e);
            out.textContent = 'Erro inesperado.';
        }
    });

    // inicial
    listar('');
})();
