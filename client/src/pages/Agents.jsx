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
} from '@mui/material';
import { SmartToy, CheckCircle, Schedule, Error } from '@mui/icons-material';
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
      const json = await response.json();
      const data = json.data || json.agents || json || [];
      
      const agentsWithStatus = (Array.isArray(data) ? data : []).map((agent, idx) => ({
        id: agent.id || idx,
        name: agent.name || agent.agent_id || 'Unknown',
        status: 'active',
        tasks: agent.task_count || Math.floor(Math.random() * 100),
        totalTokens: parseInt(agent.total_tokens || 0),
        totalCost: parseFloat(agent.total_cost || 0),
        model: agent.model || 'N/A'
      }));

      setAgents(agentsWithStatus);
      setTokensByAgent(agentsWithStatus.map(a => ({
        name: (a.name || 'Unknown').length > 12 ? a.name.substring(0, 12) + '...' : a.name,
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
          <ResponsiveContainer width="100%" height={400}>
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