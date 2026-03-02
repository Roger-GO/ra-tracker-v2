import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab
} from '@mui/material';
import { Speed, Memory, TrendingUp } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4', '#795548', '#607d8b'];

function Models() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    fetchModelsData();
  }, []);

  const fetchModelsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v2/models/usage');
      const json = await response.json();
      const data = json.data || json.models || json || [];
      
      const modelsWithStats = (Array.isArray(data) ? data : []).map((model, idx) => ({
        id: model.id || idx,
        name: model.model || model.name || 'Unknown',
        provider: model.provider || 'Unknown',
        calls: parseInt(model.calls || model.api_calls || 0),
        tokens: parseInt(model.tokens || 0),
        cost: parseFloat(model.cost || model.total_cost || 0),
        status: 'active'
      }));

      setModels(modelsWithStats);
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

  const totalCalls = models.reduce((sum, m) => sum + m.calls, 0);
  const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);
  const totalCost = models.reduce((sum, m) => sum + m.cost, 0);

  const tokensByModel = models.map(m => ({
    name: (m.name || 'Unknown').split('/').pop() || 'Unknown',
    tokens: m.tokens
  })).sort((a, b) => b.tokens - a.tokens);

  const costByModel = models.map(m => ({
    name: (m.name || 'Unknown').split('/').pop() || 'Unknown',
    cost: m.cost
  })).sort((a, b) => b.cost - a.cost);

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Models Usage
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        AI models and their usage statistics
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: '#fff' }}>
                <Speed />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Calls</Typography>
                <Typography variant="h5" fontWeight={600}>{totalCalls.toLocaleString()}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'secondary.main', color: '#fff' }}>
                <Memory />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Tokens</Typography>
                <Typography variant="h5" fontWeight={600}>{totalTokens.toLocaleString()}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'success.main', color: '#fff' }}>
                <TrendingUp />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                <Typography variant="h5" fontWeight={600}>${totalCost.toFixed(2)}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Model Cards" />
        <Tab label="Token Usage" />
        <Tab label="Cost Distribution" />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={3}>
          {models.map((model) => (
            <Grid item xs={12} md={6} key={model.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">{model.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {model.provider}
                      </Typography>
                    </Box>
                    <Chip
                      label={model.status}
                      color={model.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Calls</Typography>
                      <Typography variant="body1" fontWeight={600}>{model.calls.toLocaleString()}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Tokens</Typography>
                      <Typography variant="body1" fontWeight={600}>{model.tokens.toLocaleString()}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="body2" color="text.secondary">Cost</Typography>
                      <Typography variant="body1" fontWeight={600}>${model.cost.toFixed(2)}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Tokens by Model</Typography>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={tokensByModel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => value.toLocaleString()} />
                <Bar dataKey="tokens">
                  {tokensByModel.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Cost by Model</Typography>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={costByModel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                <Bar dataKey="cost">
                  {costByModel.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default Models;