import { buildUrl } from "../state/url";
import { useStore } from "../state/store";

/** INTERACTION §10: copy the canonical URL; fall back to a pre-selected read-only field. */
export async function shareView() {
  const url = location.origin + buildUrl();
  const { toast } = useStore.getState();
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    window.prompt("Copy this link", url);
  }
}
