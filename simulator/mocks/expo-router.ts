export const navigations: string[] = [];
export const router = {
  push: (to: string) => navigations.push(`push ${to}`),
  navigate: (to: string) => navigations.push(`navigate ${to}`),
};
