const decode = value => {
  try { return JSON.parse(value); } catch { return value; }
};

export function createSseParser(onEvent) {
  let buffer = '';
  const drain = flush => {
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      emit(block);
    }
    if (flush && buffer.trim()) { emit(buffer); buffer = ''; }
  };
  const emit = block => {
    let event = 'message'; const data = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length) onEvent({ event, data: decode(data.join('\n')) });
  };
  return {
    push(chunk) { buffer += chunk; drain(false); },
    finish() { drain(true); },
  };
}
