document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('err'), btn = document.getElementById('go');
  err.textContent = ''; btn.disabled = true;
  try {
    const d = await VT.api('POST', '/auth/login', { email: document.getElementById('email').value, password: document.getElementById('pw').value });
    if (d.user.role !== 'ADMIN') { await VT.api('POST', '/auth/logout'); throw new Error('This account is not an administrator.'); }
    location.href = './';
  } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
});
