// Sustituto de expo-sqlite SOLO para la vista previa en navegador.
const db = {
  execAsync: async () => {},
  runAsync: async () => ({}),
  getFirstAsync: async () => ({ user_version: 99, trips: 0 }),
  getAllAsync: async () => [],
};
module.exports = { __esModule: true, openDatabaseAsync: async () => db };
