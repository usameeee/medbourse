/**
 * Email dev mode: outbound mail is not sent yet, so we only record intent.
 * See docs/EMAIL.md. Never log invitation tokens, passwords, or mail bodies.
 */
export function recordOutboundMail(kind: string, to: string): void {
  console.info(`[medbourse-api] mail deferred (${kind}) to=${to} — dev mode: not sent`);
}
