export const Platform = { OS: 'android' };
export const PermissionsAndroid = {
  PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
  check: async () => true,
  request: async () => 'granted',
};
