import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';


import { StyleSheet } from 'react-native';

export default function TabLayout() {

  return (
    <Tabs
     screenOptions={{
        headerShown: false,
        tabBarStyle: {
      
         

          backgroundColor: '#1e1b4b',
        
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: 'transparent',
        },
        sceneStyle: styles.scene,
        tabBarActiveTintColor: '#00E5FF',
        tabBarInactiveTintColor: '#fff',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={28} color={color} />,
          
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={ 28} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: '#1e1b4b',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
