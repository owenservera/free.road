class BudgetService {
    constructor(db, keyPool) {
        this.db = db;
        this.keyPool = keyPool;
        this.isRunning = false;
        this.checkInterval = 60000;
        this.intervalId = null;
    }

    async initialize() {
        this.startPeriodicChecks();
    }

    async start() {
        this.isRunning = true;
        console.log('Budget Service started');
    }

    async stop() {
        this.stopPeriodicChecks();
        this.isRunning = false;
        console.log('Budget Service stopped');
    }

    startPeriodicChecks() {
        if (this.intervalId) return;

        this.intervalId = setInterval(async () => {
            await this.checkBudgets();
        }, this.checkInterval);
    }

    stopPeriodicChecks() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async checkBudgets() {
        const budgets = this.db.executeAll(`
            SELECT * FROM budgets
        `) || [];

        for (const budget of budgets) {
            if (budget.current_spent >= budget.limit) {
                console.warn(`Budget exceeded for ${budget.agent_id}`);
            }
        }
    }

    async healthCheck() {
        return {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            message: this.isRunning ? 'Budget Service is running' : 'Budget Service is stopped'
        };
    }
}

module.exports = BudgetService;
