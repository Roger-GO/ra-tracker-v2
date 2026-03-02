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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4'];

function Models() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/costs?days=30');
      const json = await res.json();
      const byModel = json.by_model || [];
      
      setModels(byModel.map(m => ({
        name: m.model || 'Unknown',
        shortName: (m.model || '').split('/').pop() || 'Unknown',
        provider: m.provider || 'openrouter',
        cost: parseFloat(m.cost_total || 0),
        tokens: m.total_tokens || 0,
        inputTokens: m.input_tokens || 0,
        outputTokens: m.output_tokens || 0,
        calls: m.request_count || 0
      })));
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

  const totalCost = models.reduce((sum, m) => sum + m.cost, 0);
  const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);
  const totalCalls = models.reduce((sum, m) => sum + m.calls, 0);

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Models
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        OpenRouter model usage breakdown
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)',
            color: 'white',
            height: 100
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Spend</Typography>
              <Typography variant="h4" fontWeight={700}>${totalCost.toFixed(2)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
            color: 'white',
            height: 100
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Tokens</Typography>
              <Typography variant="h4" fontWeight={700}>{(totalTokens / 1000000).toFixed(2)}M</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)',
            color: 'white',
            height: 100
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>Total Calls</Typography>
              <Typography variant="h4" fontWeight={700}>{totalCalls.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Model Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {models.map((model, idx) => (
          <Grid item xs={12} sm={6} md={3} key={idx}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {model.shortName}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {model.provider}
                </Typography>
                <Typography variant="h5" fontWeight={700} color="primary">
                  ${model.cost.toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(model.tokens / 1000000).toFixed(2)}M tokens
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {model.calls} calls
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>Cost by Model</Typography>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={models}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="shortName" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#9c27b0" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 450 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600} gutterBottom>Token Distribution</Typography>
              <ResponsiveContainer width="100%" height={380}>
                <PieChart>
                  <Pie
                    data={models}
                    dataKey="tokens"
                    nameKey="shortName"
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {models.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Models;