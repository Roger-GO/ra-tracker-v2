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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    summary: {},
    byModel: [],
    byAgent: [],
    byDate: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/costs?days=30');
      const json = await res.json();
      
      setData({
        summary: json.summary || {},
        byModel: json.by_model || [],
        byAgent: json.by_agent || [],
        byDate: json.by_date || []
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

  const { summary, byModel, byAgent, byDate } = data;

  // Format data for charts
  const dateChartData = (byDate || []).slice(0, 14).map(d => ({
    date: new Date(d.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: parseFloat(d.cost_total || 0),
    tokens: d.total_tokens || 0,
    calls: d.request_count || 0
  })).reverse();

  const modelChartData = (byModel || []).map(m => ({
    name: (m.model || '').split('/').pop() || 'Unknown',
    cost: parseFloat(m.cost_total || 0),
    tokens: m.total_tokens || 0,
    calls: m.request_count || 0
  }));

  const agentChartData = (byAgent || []).slice(0, 8).map(a => ({
    name: a.name || 'Unknown',
    cost: parseFloat(a.cost_total || 0),
    tokens: a.total_tokens || 0
  }));

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        OpenRouter API Usage & Costs
      </Typography>

      {/* Stats Cards - Material Dashboard Style */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total OpenRouter Spend</Typography>
              <Typography variant="h3" fontWeight={700}>${(summary.total_cost || 0).toFixed(2)}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Last 30 days</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total API Calls</Typography>
              <Typography variant="h3" fontWeight={700}>{(summary.request_count || 0).toLocaleString()}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Requests made</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Tokens</Typography>
              <Typography variant="h3" fontWeight={700}>{((summary.total_tokens || 0) / 1000000).toFixed(2)}M</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Input + Output</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Active Models</Typography>
              <Typography variant="h3" fontWeight={700}>{summary.model_count || 0}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Different models</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts - Full Width */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                Daily Costs ($)
              </Typography>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={dateChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Line 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="#9c27b0" 
                    strokeWidth={3}
                    dot={{ fill: '#9c27b0', strokeWidth: 2 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                Costs by Model ($)
              </Typography>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={modelChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#2196f3" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                Costs by Agent ($)
              </Typography>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={agentChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#4caf50" radius={[0, 8, 8, 0]} />
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