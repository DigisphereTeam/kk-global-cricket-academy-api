let accessToken = null;
let tokenExpiry = null;

module.exports = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getTokenExpiry: () => tokenExpiry,
  setTokenExpiry: (expiry) => {
    tokenExpiry = expiry;
  },
};