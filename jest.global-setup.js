// Force a non-UTC timezone with DST so tests catch code that depends on the machine's timezone.
module.exports = async () => {
  process.env.TZ = "America/Los_Angeles";
};
