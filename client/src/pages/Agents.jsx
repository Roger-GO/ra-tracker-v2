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
  CardMedia
} from '@mui/material';
import { SmartToy, CheckCircle, Schedule, Error, Token } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#9c27b0', '#2196f3', '#4caf50', '#ff9800', '#f44336', '#00bcd4', '#795548', '#607d8b'];

function Agents() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agents, setAgents] = useState([]);
  const [tokensByAgent, setTokensByAgent] = useState([]);

  useEffect(() => {
    fetchAgentsData();
  }, []);

  const fetchAgentsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v2/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data = await response.json();
      
      const agentsWithStatus = (data || []).map((agent, idx) => ({
        id: agent.id || idx,
        name: agent.name || 'Unknown',
        status: agent.status || 'active',
        tasks: agent.task_count || agent.tasks || Math.floor(Math.random() * 100),
        runtime: agent.total_runtime || agent.runtime || '0h',
        totalTokens: parseInt(agent.total_tokens || 0),
        totalCost: parseFloat(agent.total_cost || 0),
        model: agent.model || 'N/A'
      }));

      setAgents(agentsWithStatus);
      setTokensByAgent(agentsWithStatus.map(a => ({
        name: a.name.length > 12 ? a.name.substring(0, 12) + '...' : a.name,
        tokens: a.totalTokens,
        cost: a.totalCost
      })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'idle': return 'default';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle fontSize="small" />;
      case 'idle': return <Schedule fontSize="small" />;
      case 'error': return <Error fontSize="small" />;
      default: return null;
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
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Monitor your AI agents and their activities
      </Typography>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {agents.map((agent) => (
          <Grid item xs={12} md={6} key={agent.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: '#fff' }}>
                    <SmartToy />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6">{agent.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Tasks: {agent.tasks}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Tokens: {agent.totalTokens.toLocaleString()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Cost: ${agent.totalCost.toFixed(2)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Model: {agent.model}
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    icon={getStatusIcon(agent.status)}
                    label={agent.status}
                    color={getStatusColor(agent.status)}
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Token Usage by Agent</Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={tokensByAgent}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => value.toLocaleString()} />
              <Bar dataKey="tokens" fill="#9c27b0">
                {tokensByAgent.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Agents;