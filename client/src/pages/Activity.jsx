import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip
} from '@mui/material';
import { Event, Code, Web, Storage, Refresh, Token, AttachMoney } from '@mui/icons-material';

function Activity() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchActivity();
    const interval = autoRefresh ? setInterval(fetchActivity, 30000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, filter]);

  const fetchActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v2/activity');
      const json = await response.json();
      const data = json.data || json || [];
      
      let activitiesList = (Array.isArray(data) ? data : []).map((item, idx) => ({
        id: item.id || idx,
        type: item.type || item.event_type || 'api',
        message: item.message || item.description || `${item.agent_name || 'System'} - ${item.action || 'Activity'}`,
        time: item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Just now',
        agent: item.agent_name || item.agent || 'System',
        tokens: item.tokens || 0,
        cost: item.cost || 0
      }));

      if (filter !== 'all') {
        activitiesList = activitiesList.filter(a => a.type === filter);
      }

      setActivities(activitiesList.slice(0, 50));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'code': return <Code />;
      case 'web': return <Web />;
      case 'token': return <Token />;
      case 'cost': return <AttachMoney />;
      case 'api': return <Event />;
      case 'db': return <Storage />;
      default: return <Event />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'code': return 'primary';
      case 'token': return 'secondary';
      case 'cost': return 'success';
      case 'web': return 'info';
      case 'api': return 'warning';
      case 'db': return 'success';
      default: return 'default';
    }
  };

  if (loading && activities.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && activities.length === 0) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Activity
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Recent agent activities and events
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Auto-refresh every 30s">
            <IconButton onClick={() => setAutoRefresh(!autoRefresh)} color={autoRefresh ? 'primary' : 'default'}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Filter</InputLabel>
            <Select
              value={filter}
              label="Filter"
              onChange={(e) => setFilter(e.target.value)}
              size="small"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="token">Tokens</MenuItem>
              <MenuItem value="cost">Costs</MenuItem>
              <MenuItem value="code">Code</MenuItem>
              <MenuItem value="web">Web</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {activities.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No activities found
              </Typography>
            </Box>
          ) : (
            <List>
              {activities.map((activity, index) => (
                <ListItem
                  key={activity.id}
                  divider={index < activities.length - 1}
                  sx={{ py: 2 }}
                >
                  <ListItemIcon>
                    <Box
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        bgcolor: `${getTypeColor(activity.type)}.main`,
                        color: '#fff',
                      }}
                    >
                      {getTypeIcon(activity.type)}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={activity.message}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        <span>{activity.time}</span>
                        {activity.agent && <span>Agent: {activity.agent}</span>}
                        {activity.tokens > 0 && <span>Tokens: {activity.tokens.toLocaleString()}</span>}
                        {activity.cost > 0 && <span>Cost: ${activity.cost.toFixed(4)}</span>}
                      </Box>
                    }
                  />
                  <Chip
                    label={(activity.type || 'api').toUpperCase()}
                    size="small"
                    color={getTypeColor(activity.type)}
                    variant="outlined"
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Activity;