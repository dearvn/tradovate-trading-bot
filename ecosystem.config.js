/**
 * PM2 ecosystem — one OS process per agent.
 *
 * Start all agents:   pm2 start ecosystem.config.js
 * Stop all agents:    pm2 stop ecosystem.config.js
 * Reload all agents:  pm2 reload ecosystem.config.js
 * Logs:               pm2 logs
 * Monitor:            pm2 monit
 */

module.exports = {
  apps: [
    {
      name: 'agent-config',
      script: 'agents/config/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'config'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'config'
      },
      error_file: 'logs/pm2/agent-config-error.log',
      out_file: 'logs/pm2/agent-config-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-notification',
      script: 'agents/notification/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'notification'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'notification'
      },
      error_file: 'logs/pm2/agent-notification-error.log',
      out_file: 'logs/pm2/agent-notification-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-market-data',
      script: 'agents/market-data/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'market-data'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'market-data'
      },
      error_file: 'logs/pm2/agent-market-data-error.log',
      out_file: 'logs/pm2/agent-market-data-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-strategy',
      script: 'agents/strategy/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'strategy'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'strategy'
      },
      error_file: 'logs/pm2/agent-strategy-error.log',
      out_file: 'logs/pm2/agent-strategy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-order',
      script: 'agents/order/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'order'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'order'
      },
      error_file: 'logs/pm2/agent-order-error.log',
      out_file: 'logs/pm2/agent-order-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-order-flow',
      script: 'agents/order-flow/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'order-flow'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'order-flow'
      },
      error_file: 'logs/pm2/agent-order-flow-error.log',
      out_file: 'logs/pm2/agent-order-flow-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'agent-frontend',
      script: 'agents/frontend/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        NODE_APP_INSTANCE: 'frontend',
        PORT: '80'
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_APP_INSTANCE: 'frontend',
        PORT: '80'
      },
      error_file: 'logs/pm2/agent-frontend-error.log',
      out_file: 'logs/pm2/agent-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
