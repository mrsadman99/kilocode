export function loopback(url: string) {
  const host = new URL(url).hostname
  return host === "localhost" || /^127\.\d+\.\d+\.\d+$/.test(host) || host === "::1" || host === "[::1]"
}
