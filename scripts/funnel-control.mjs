const handlerMissing = error => error?.code === 'ENOENT' || /handler does not exist/i.test(`${error?.stderr || ''}\n${error?.message || ''}`);

export async function configureFunnel({ enabled, revoke = false, httpsPort, targetPort, binary, runner }) {
  const port = Number(httpsPort);
  if (enabled) {
    const output = await runner(binary, ['funnel', '--yes', '--bg', `--https=${httpsPort}`, String(targetPort)]);
    return { status: 'enabled', httpsPort: port, targetPort: Number(targetPort), output };
  }
  if (!revoke) return { status: 'unmanaged', httpsPort: port };
  try {
    await runner(binary, ['funnel', '--yes', `--https=${httpsPort}`, 'off']);
    return { status: 'disabled', httpsPort: port };
  } catch (error) {
    if (handlerMissing(error)) return { status: 'already_disabled', httpsPort: port };
    throw error;
  }
}
