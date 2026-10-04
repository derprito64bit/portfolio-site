// The one polite status region (W-D032), #status in the layout. Action feedback goes here; route changes are
// announced by the Swup a11y plugin's own assertive region, the only assertive use besides errors.
const region = document.getElementById('status');
let last = '';

export function announce(text: string): void {
  if (!region) return;
  // Repeating the same text must still be read: nudge it so the live region sees a change.
  const next = text === last ? `${text} ` : text;
  last = next;
  region.textContent = '';
  region.textContent = next;
}
