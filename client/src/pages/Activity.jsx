import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';

function Activity() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/v2/activity');
      const json = await res.json();
      const list = json.data || json || [];
      setActivities(list.slice(0, 20));
      setLoading(false);
    } catch (err) {
      setError(err.message);
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
        Activity
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Recent API activity (auto-refreshes every 30s)
      </Typography>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {activities.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No recent activity</Typography>
            </Box>
          ) : (
            activities.map((item, idx) => (
              <Box 
                key={idx} 
                sx={{ 
                  p: 2, 
                  borderBottom: idx < activities.length - 1 ? '1px solid #eee' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    {item.agent_name || item.agent || 'System'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.action || item.type || 'API Call'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" fontWeight={600}>
                    ${(item.cost || 0).toFixed(4)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.tokens ? `${item.tokens.toLocaleString()} tokens` : ''}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Activity;