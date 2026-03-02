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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function Agents() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/costs?days=30');
      const json = await res.json();
      const byAgent = json.by_agent || [];
      
      setAgents(byAgent.map(a => ({
        name: a.name || 'Unknown',
        cost: parseFloat(a.cost_total || 0),
        tokens: a.total_tokens || 0,
        calls: a.request_count || 0
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

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Agents
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        OpenRouter usage by agent
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {agents.slice(0, 6).map((agent, idx) => (
          <Grid item xs={12} sm={6} md={4} key={idx}>
            <Card sx={{ 
              background: idx === 0 ? 'linear-gradient(135deg, #9c27b0 0%, #ba68c8 100%)' : 
                          idx === 1 ? 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)' :
                          idx === 2 ? 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)' :
                          'default',
              color: idx < 3 ? 'white' : 'inherit',
              height: '100%'
            }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600}>{agent.name}</Typography>
                <Typography variant="h4" fontWeight={700}>${agent.cost.toFixed(2)}</Typography>
                <Typography variant="body2" sx={{ opacity: idx < 3 ? 0.9 : 0.7 }}>
                  {agent.tokens.toLocaleString()} tokens • {agent.calls} calls
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ height: 500 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={600} gutterBottom>Agent Costs Comparison</Typography>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={agents.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
              <Bar dataKey="cost" fill="#9c27b0" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Agents;