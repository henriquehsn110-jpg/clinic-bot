/**
 * Ecosystem Configuration — PM2 Process Manager
 * ClinicaBot SaaS Pro — Alta Disponibilidade & Auto-Recovery 24h
 */

module.exports = {
  apps: [
    {
      name: 'clinicabot-api',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'clinicabot-watchdog',
      script: './scripts/watchdog_contingency_agent.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
