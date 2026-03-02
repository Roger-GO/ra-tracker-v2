import React from 'react';
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
} from '@mui/material';
import { Event, Code, Web, Storage } from '@mui/icons-material';

const activities = [
  { id: 1, type: 'code', message: 'Code Agent completed task #124', time: '5 min ago' },
  { id: 2, type: 'web', message: 'Web Agent fetched 45 pages', time: '12 min ago' },
  { id: 3, type: 'api', message: 'API request processed successfully', time: '18 min ago' },
  { id: 4, type: 'db', message: 'Database synced with OpenRouter', time: '25 min ago' },
  { id: 5, type: 'code', message: 'Code Agent started new task #125', time: '32 min ago' },
  { id: 6, type: 'web', message: 'Web Agent detected 3 new links', time: '45 min ago' },
];

const getTypeIcon = (type) => {
  switch (type) {
    case 'code': return <Code />;
    case 'web': return <Web />;
    case 'api': return <Event />;
    case 'db': return <Storage />;
    default: return <Event />;
  }
};

const getTypeColor = (type) => {
  switch (type) {
    case 'code': return 'primary';
    case 'web': return 'info';
    case 'api': return 'warning';
    case 'db': return 'success';
    default: return 'default';
  }
};

function Activity() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Activity
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Recent agent activities and events
      </Typography>
      
      <Card>
        <CardContent sx={{ p: 0 }}>
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
                  secondary={activity.time}
                />
                <Chip
                  label={activity.type.toUpperCase()}
                  size="small"
                  color={getTypeColor(activity.type)}
                  variant="outlined"
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Activity;