import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  IconButton,
  CircularProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { Send, History, Psychology } from '@mui/icons-material';

function NLP() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [queryHistory, setQueryHistory] = useState([]);

  const handleQuery = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    
    const userQuery = query;
    setQuery('');

    try {
      const response = await fetch('/api/v2/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery })
      });
      
      if (!response.ok) throw new Error('Query failed');
      
      const data = await response.json();
      
      const newResult = {
        id: Date.now(),
        query: userQuery,
        response: data,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setResults(prev => [newResult, ...prev]);
      setQueryHistory(prev => [userQuery, ...prev.slice(0, 9)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  const loadHistoryItem = (item) => {
    setQuery(item);
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        NLP Query
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Ask questions in natural language about your data
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Psychology color="primary" />
                <Typography variant="h6">Ask anything</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="e.g., How much did I spend yesterday? or Top agents by tokens this month"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
                <IconButton 
                  color="primary" 
                  onClick={handleQuery}
                  disabled={loading || !query.trim()}
                  sx={{ alignSelf: 'flex-end' }}
                >
                  {loading ? <CircularProgress size={24} /> : <Send />}
                </IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Try: "costs by project", "top agents", "tokens this week", "activity today"
              </Typography>
            </CardContent>
          </Card>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {results.length === 0 && !loading && (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                No queries yet. Ask your first question above!
              </Typography>
            </Paper>
          )}

          {results.map((result) => (
            <Card key={result.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ 
                    p: 1, 
                    borderRadius: 1, 
                    bgcolor: 'primary.main', 
                    color: '#fff',
                    minWidth: 40,
                    textAlign: 'center'
                  }}>
                    ?
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {result.query}
                    </Typography>
                    <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {typeof result.response === 'object' 
                          ? JSON.stringify(result.response, null, 2)
                          : result.response
                        }
                      </Typography>
                    </Paper>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {result.timestamp}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <History color="action" />
                <Typography variant="h6">Query History</Typography>
              </Box>
              {queryHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No history yet
                </Typography>
              ) : (
                <List dense>
                  {queryHistory.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <ListItem button onClick={() => loadHistoryItem(item)}>
                        <ListItemText 
                          primary={item.length > 40 ? item.substring(0, 40) + '...' : item}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                      {idx < queryHistory.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default NLP;