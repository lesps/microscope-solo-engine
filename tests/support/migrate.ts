// Test code under src/export may not import persistence; this re-export lets it parse old files.
export { migrateEvents } from '../../src/persistence/migrations';
