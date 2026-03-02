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
          <Typography variant="h4" fontWeight={600}>
            {value}
          </Typography>
        </Box>
        <Box
          sx={{
            p: 1.5,
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
      // Fetch costs
      const costsRes = await fetch('/api/v2/costs?days=30');
      const costsJson = await costsRes.json();
      const costsData = costsJson.summary || {};
      
      // Fetch agents
      const agentsRes = await fetch('/api/v2/agents');
      const agentsJson = await agentsRes.json();
      const agentsData = agentsJson.agents || agentsJson.data || agentsJson || [];
      
      // Fetch activity
      const activityRes = await fetch('/api/v2/activity');
      const activityJson = await activityRes.json();
      const activityList = activityJson.data || activityJson || [];

      // Calculate stats
      const totalCosts = costsData.total_cost || 0;
      const totalActivities = activityList.length || 0;
      const activeAgents = Array.isArray(agentsData) ? agentsData.length : 0;
      
      // Transform activity for chart
      const activityByDay = {};
      activityList.forEach(item => {
        const timestamp = item.timestamp || item.created_at;
        if (timestamp) {
          const date = new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short' });
          activityByDay[date] = (activityByDay[date] || 0) + 1;
        }
      });
      
      const activityChartData = Object.entries(activityByDay)
        .map(([name, value]) => ({ name, value }))
        .slice(0, 7);

      // Use by_model for costs chart
      const costChartData = (costsJson.by_model || []).slice(0, 5).map(m => ({
        name: m.model?.split('/').pop() || 'Unknown',
        cost: m.cost_total || 0
      }));

      setStats({
        totalActivities,
        totalCosts,
        activeAgents,
        weeklyGrowth: 0,
      });
      setActivityData(activityChartData.length > 0 ? activityChartData : [{ name: 'No data', value: 0 }]);
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
        Welcome to RA Tracker
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Real-time activity tracking and analytics for your AI agents
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Activities"
            value={stats.totalActivities.toLocaleString()}
            icon={<Timeline />}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Costs"
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

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Daily Activity
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#9c27b0"
                    fill="rgba(156, 39, 176, 0.2)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Cost by Model
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="cost" fill="#e91e63" />
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