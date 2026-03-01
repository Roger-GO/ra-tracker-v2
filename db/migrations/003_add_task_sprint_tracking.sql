-- ============================================
-- MIGRATION: 003_add_task_sprint_tracking
-- Adds task and sprint tracking capabilities
-- ============================================

-- Add task_label and sprint_id columns to sessions table
ALTER TABLE sessions ADD COLUMN task_label TEXT;
ALTER TABLE sessions ADD COLUMN sprint_id INTEGER;

-- Create sprints table
CREATE TABLE IF NOT EXISTS sprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sprint_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sprint_id) REFERENCES sprints(id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_task_label ON sessions(task_label);
CREATE INDEX IF NOT EXISTS idx_sessions_sprint_id ON sessions(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);

-- Create a view for cost aggregation by task
CREATE VIEW IF NOT EXISTS view_costs_by_task AS
SELECT 
    s.task_label as task_label,
    s.sprint_id,
    sp.name as sprint_name,
    COUNT(DISTINCT s.id) as session_count,
    COUNT(DISTINCT tu.id) as token_record_count,
    SUM(tu.input_tokens) as total_input_tokens,
    SUM(tu.output_tokens) as total_output_tokens,
    SUM(tu.total_tokens) as total_tokens,
    SUM(tu.cost_input) as cost_input,
    SUM(tu.cost_output) as cost_output,
    SUM(tu.cost_total) as cost_total
FROM sessions s
LEFT JOIN token_usage tu ON s.id = tu.session_id
LEFT JOIN sprints sp ON s.sprint_id = sp.id
WHERE s.task_label IS NOT NULL
GROUP BY s.task_label, s.sprint_id;

-- Create a view for cost aggregation by sprint
CREATE VIEW IF NOT EXISTS view_costs_by_sprint AS
SELECT 
    sp.id as sprint_id,
    sp.name as sprint_name,
    sp.start_date,
    sp.end_date,
    sp.status,
    COUNT(DISTINCT s.id) as session_count,
    COUNT(DISTINCT t.id) as task_count,
    COUNT(DISTINCT tu.id) as token_record_count,
    SUM(tu.total_tokens) as total_tokens,
    SUM(tu.cost_total) as cost_total
FROM sprints sp
LEFT JOIN sessions s ON sp.id = s.sprint_id
LEFT JOIN tasks t ON sp.id = t.sprint_id
LEFT JOIN token_usage tu ON s.id = tu.session_id
GROUP BY sp.id;

-- Create a view for cost by model per task
CREATE VIEW IF NOT EXISTS view_costs_model_by_task AS
SELECT 
    s.task_label,
    s.sprint_id,
    sp.name as sprint_name,
    tu.model,
    tu.provider,
    SUM(tu.input_tokens) as input_tokens,
    SUM(tu.output_tokens) as output_tokens,
    SUM(tu.total_tokens) as total_tokens,
    SUM(tu.cost_total) as cost_total,
    COUNT(*) as request_count
FROM sessions s
JOIN token_usage tu ON s.id = tu.session_id
LEFT JOIN sprints sp ON s.sprint_id = sp.id
WHERE s.task_label IS NOT NULL
GROUP BY s.task_label, s.sprint_id, tu.model, tu.provider;