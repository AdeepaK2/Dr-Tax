// Records what the app would show in the Android notification shade.
export type Sent = { id: string; title: string; body: string; data: Record<string, unknown>; buttons: string[] };
export const sent: Sent[] = [];
export const categories = new Map<string, { identifier: string; buttonTitle: string }[]>();
export const dismissed: string[] = [];
export enum AndroidImportance { DEFAULT = 5 }
export const setNotificationHandler = () => {};
export const setNotificationChannelAsync = async () => null;
export const setNotificationCategoryAsync = async (id: string, actions: { identifier: string; buttonTitle: string }[]) => {
  categories.set(id, actions);
};
export const getPermissionsAsync = async () => ({ granted: true, canAskAgain: true });
export const requestPermissionsAsync = async () => ({ granted: true });
export const dismissNotificationAsync = async (id: string) => void dismissed.push(id);
export const scheduleNotificationAsync = async (req: { content: { title: string; body: string; data?: Record<string, unknown>; categoryIdentifier?: string } }) => {
  const id = `n${sent.length + 1}`;
  const buttons = (categories.get(req.content.categoryIdentifier ?? '') ?? []).map((a) => a.buttonTitle);
  sent.push({ id, title: req.content.title, body: req.content.body, data: req.content.data ?? {}, buttons });
  return id;
};
/** Builds the response Android would deliver when a button is tapped. */
export function tap(n: Sent, buttonTitle?: string) {
  const cat = [...categories.values()].flat().find((a) => a.buttonTitle === buttonTitle && n.buttons.includes(buttonTitle));
  return {
    actionIdentifier: cat?.identifier ?? 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: n.id, content: { data: n.data } } },
  };
}
