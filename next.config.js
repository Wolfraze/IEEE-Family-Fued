const os = require("node:os");

const allowedDevOrigins = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses || [])
  .filter(({ family, internal }) => family === "IPv4" && !internal)
  .map(({ address }) => address);

module.exports = { allowedDevOrigins };
