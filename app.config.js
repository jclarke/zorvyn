/** Dynamic Expo config — keeps app.json as the source of truth. */
const appJson = require('./app.json');

export default () => ({
  ...(appJson.expo || {}),
});
