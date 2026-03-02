import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  AttachMoney,
  SmartToy,
  Timeline,
} from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

const StatCard = ({ title, value, icon, color }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h3" fontWeight={600}>
            {value}
          </Typography>
        </Box>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: `${color}15`,
            color: color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalActivities: 0,
    totalCosts: 0,
    activeAgents: 0,
    weeklyGrowth: 0,
  });
  const [activityData, setActivityData] = useState([]);
  const [costData, setCostData] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch costs - this has OpenRouter data!
      const costsRes = await fetch('/api/v2/costs?days=30');
      const costsJson = await costsRes.json();
      const summary = costsJson.summary || {};
      const byModel = costsJson.by_model || [];
      
      // Fetch agents
      const agentsRes = await fetch('/api/v2/agents');
      const agentsJson = await agentsRes.json();
      const agents = agentsJson.data || agentsJson.agents || agentsJson || [];
      
      // Fetch activity
      const activityRes = await fetch('/api/v2/activity');
      const activityJson = await activityRes.json();
      const activityList = activityJson.data || activityJson || [];

      // Calculate stats from OpenRouter captured data
      const totalCosts = summary.total_cost || 0;
      const totalActivities = activityList.length || 0;
      const activeAgents = Array.isArray(agents) ? agents.length : 0;
      
      // Transform activity by day
      const activityByDay = {};
      activityList.forEach(item => {
        const ts = item.timestamp || item.created_at;
        if (ts) {
          const date = new Date(ts).toLocaleDateString('en-US', { weekday: 'short' });
          activityByDay[date] = (activityByDay[date] || 0) + 1;
        }
      });
      
      const activityChartData = Object.entries(activityByDay)
        .map(([name, value]) => ({ name, value }))
        .slice(0, 7);

      // Transform costs by model - THIS IS THE OPENROUTER DATA
      const costChartData = byModel.map(m => ({
        name: (m.model || '').split('/').pop() || 'Unknown',
        cost: parseFloat(m.cost_total || 0)
      }));

      setStats({
        totalActivities,
        totalCosts,
        activeAgents,
        weeklyGrowth: 0,
      });
      setActivityData(activityChartData.length > 0 ? activityChartData : [{ name: 'Mon', value: 0 }]);
      setCostData(costChartData.length > 0 ? costChartData : [{ name: 'No data', cost: 0 }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Error loading dashboard: {error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        RA Tracker Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        OpenRouter usage and agent activity analytics
      </Typography>

      {/* Stats Cards - Full Width */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total API Calls"
            value={stats.totalActivities.toLocaleString()}
            icon={<Timeline />}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total OpenRouter Spend"
            value={`$${stats.totalCosts.toFixed(2)}`}
            icon={<AttachMoney />}
            color="#e91e63"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Agents"
            value={stats.activeAgents}
            icon={<SmartToy />}
            color="#2196f3"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="This Week"
            value={`${stats.weeklyGrowth > 0 ? '+' : ''}${stats.weeklyGrowth}%`}
            icon={<TrendingUp />}
            color="#4caf50"
          />
        </Grid>
      </Grid>

      {/* Charts - FULL WIDTH and TALL */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 500 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                API Calls by Day
              </Typography>
              <ResponsiveContainer width="100%" height={420}>
                <AreaChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 14 }} />
                  <YAxis tick={{ fontSize: 14 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#9c27b0"
                    fill="rgba(156, 39, 176, 0.3)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 500 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                OpenRouter Spend by Model ($)
              </Typography>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                  <YAxis tick={{ fontSize: 14 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#e91e63" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;