/**
 * auth.js — Lógica da tela de login
 */

document.addEventListener('DOMContentLoaded', () => {
  // Se já logado, vai direto para o dashboard
  if (Api.estaLogado()) {
    window.location.href = '/dashboard';
    return;
  }

  const form    = document.getElementById('form-login');
  const alerta  = document.getElementById('alerta-login');
  const btnText = document.getElementById('btn-texto');
  const spinner = document.getElementById('spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alerta.className = 'alerta';
    alerta.textContent = '';

    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    // Loading
    btnText.textContent = 'Entrando...';
    spinner.style.display = 'inline-block';
    form.querySelector('button[type=submit]').disabled = true;

    try {
      const resp = await Api.login(email, senha);
      Api.salvarSessao(resp.access_token, resp.usuario);
      window.location.href = '/dashboard';
    } catch (err) {
      const msg = err.erro || 'Erro ao conectar. Tente novamente.';
      alerta.textContent = msg;
      alerta.className = 'alerta alerta-erro visivel';
    } finally {
      btnText.textContent = 'Entrar';
      spinner.style.display = 'none';
      form.querySelector('button[type=submit]').disabled = false;
    }
  });
});
