import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
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
  const [dashboardData, setDashboardData] = useState({
    totalActivities: 0,
    totalCosts: 0,
    activeAgents: 0,
    weeklyGrowth: 0,
    activityData: [],
    costData: [],
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch multiple endpoints in parallel
      const [activityRes, costsRes, agentsRes] = await Promise.all([
        fetch('/api/v2/activity'),
        fetch('/api/v2/costs?days=7'),
        fetch('/api/v2/agents'),
      ]);

      if (!activityRes.ok || !costsRes.ok || !agentsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [activityData, costsData, agentsData] = await Promise.all([
        activityRes.json(),
        costsRes.json(),
        agentsRes.json(),
      ]);

      // Process activity data for chart (last 7 days)
      const activityByDay = Array.isArray(activityData)
        ? activityData.slice(-7).map(item => ({
            name: new Date(item.timestamp || item.date).toLocaleDateString('en-US', { weekday: 'short' }),
            value: item.count || 1
          }))
        : [];

      // Process costs data for trend chart (last 4 weeks)
      const costsByWeek = Array.isArray(costsData)
        ? costsData.reduce((acc, item, idx) => {
            const weekIdx = Math.floor(idx / 7);
            if (!acc[weekIdx]) {
              acc[weekIdx] = { name: `Week ${weekIdx + 1}`, cost: 0 };
            }
            acc[weekIdx].cost += parseFloat(item.total_cost || item.cost || 0);
            return acc;
          }, [])
        : [];

      // Calculate summary stats
      const totalActivities = Array.isArray(activityData) ? activityData.length : 0;
      const totalCosts = Array.isArray(costsData)
        ? costsData.reduce((sum, item) => sum + parseFloat(item.total_cost || item.cost || 0), 0)
        : 0;
      const activeAgents = Array.isArray(agentsData)
        ? agentsData.filter(a => a.status === 'active' || a.last_activity).length
        : 0;

      // Calculate weekly growth (compare last 3 days vs previous 3 days)
      let weeklyGrowth = 0;
      if (activityData.length >= 6) {
        const recent = activityData.slice(-3).reduce((sum, item) => sum + (item.count || 1), 0);
        const previous = activityData.slice(-6, -3).reduce((sum, item) => sum + (item.count || 1), 0);
        weeklyGrowth = previous > 0 ? ((recent - previous) / previous * 100) : 0;
      }

      setDashboardData({
        totalActivities,
        totalCosts,
        activeAgents,
        weeklyGrowth,
        activityData: activityByDay,
        costData: costsByWeek,
      });
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
    return <Alert severity="error">{error}</Alert>;
  }

  const { totalActivities, totalCosts, activeAgents, weeklyGrowth, activityData, costData } = dashboardData;

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
            value={totalActivities.toLocaleString()}
            icon={<Timeline />}
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Costs"
            value={`$${totalCosts.toFixed(2)}`}
            icon={<AttachMoney />}
            color="#e91e63"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Agents"
            value={activeAgents.toString()}
            icon={<SmartToy />}
            color="#2196f3"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="This Week"
            value={`${weeklyGrowth >= 0 ? '+' : ''}${weeklyGrowth.toFixed(0)}%`}
            icon={<TrendingUp />}
            color={weeklyGrowth >= 0 ? "#4caf50" : "#f44336"}
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Weekly Activity
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
                Cost Trends
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`$${value.toFixed(2)}`, 'Cost']} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#e91e63"
                    strokeWidth={2}
                    dot={{ fill: '#e91e63' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;