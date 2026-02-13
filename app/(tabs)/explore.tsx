import React, { useEffect, useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export default function App() {
  const [orders, setOrders] = useState([]);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [delverName, setDelverName] = useState('');
  const [delverEmail, setDelverEmail] = useState('');
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [clientsLocations, setClientsLocations] = useState([]);

  const locationInterval = useRef(null);
  const locationWarned = useRef(false);

  useEffect(() => {
    getDelverData().then(() => {
      fetchOrders();
      fetchAllClientsLocations();
    });

    const interval = setInterval(() => {
      fetchOrders();
      fetchAllClientsLocations();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ================= تحديث الموقع =================
  useEffect(() => {
    const updateLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationInterval.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });
          const newLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          };
          setLocation(newLocation);

          if (delverEmail) {
            await axios.post(
              'https://back-end-nodejs-production-fdc5.up.railway.app/api/delver/update-location',
              {
                email: delverEmail,
                latitude: newLocation.latitude,
                longitude: newLocation.longitude
              }
            );
          }
        } catch (_err) {
          if (!locationWarned.current) {
            locationWarned.current = true;
            if (__DEV__) {
              console.warn('الموقع غير متوفر. فعّل خدمات الموقع (GPS) في إعدادات الجهاز.');
            }
          }
        }
      }, 3000);
    };

    updateLocation();
    return () =>
      locationInterval.current && clearInterval(locationInterval.current);
  }, [delverEmail]);

  const getDelverData = async () => {
    const name = await AsyncStorage.getItem('name');
    const email = await AsyncStorage.getItem('email');
    setDelverName(name || 'مندوب');
    setDelverEmail(email || '');
  };

  // ================= جلب الطلبات (ثابت ولا يحذف القديم) =================
  const fetchOrders = async () => {
    try {
      const email = await AsyncStorage.getItem('email');
      if (!email) return;

      const res = await axios.get(
        'https://back-end-nodejs-production-fdc5.up.railway.app/api/delver/all'
      );

      const newOrders = [];

      res.data.users.forEach(user => {
        const products = Array.isArray(user.products)
          ? user.products.filter(p => p.delverEmail === email)
          : [];

        const clientGroups = {};
        products.forEach(p => {
          const key = `${p.clientName}-${p.clientPhone}`;
          if (!clientGroups[key]) clientGroups[key] = [];
          clientGroups[key].push(p);
        });

        Object.keys(clientGroups).forEach(key => {
          const items = clientGroups[key];
          newOrders.push({
            id: key,
            clientName: items[0].clientName,
            clientPhone: items[0].clientPhone,
            items,
            totalPrice: items.reduce(
              (s, i) => s + i.price * i.quantity,
              0
            ),
            accepted: items[0].accepted || false,
            delivered: items[0].delivered || false,
            email
          });
        });
      });

      setOrders(prev => {
        const merged = [...prev];

        newOrders.forEach(newOrder => {
          const index = merged.findIndex(o => o.id === newOrder.id);

          if (index !== -1) {
            merged[index] = {
              ...merged[index],
              ...newOrder,
              accepted:
                merged[index].accepted || newOrder.accepted,
              delivered:
                merged[index].delivered || newOrder.delivered
            };
          } else {
            merged.push(newOrder);
          }
        });

        return merged;
      });
    } catch (err) {
      console.log('خطأ في جلب الطلبات:', err.message);
    }
  };

  const fetchAllClientsLocations = async () => {
    try {
      const res = await axios.get(
        'https://back-end-nodejs-production-fdc5.up.railway.app/api/user/all-locations'
      );

      if (res.data.users) {
        const locations = [];
        res.data.users.forEach(user => {
          if (user.location) {
            locations.push({
              name: user.name,
              email: user.email,
              phone: user.phone,
              location: user.location
            });
          }
        });
        setClientsLocations(locations);
      }
    } catch (err) {
      console.log('خطأ في جلب مواقع الزبائن:', err.message);
    }
  };

  const openGoogleMaps = clientName => {
    const client = clientsLocations.find(
      c => c.name === clientName
    );
    if (!client || !client.location) {
      Alert.alert('⚠️ لا يوجد موقع مسجل لهذا الزبون');
      return;
    }
    Linking.openURL(
      `https://www.google.com/maps?q=${client.location}`
    );
  };

  const callClient = phone => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const acceptOrder = async order => {
    try {
      if (!order.accepted) {
        await axios.post(
          'https://back-end-nodejs-production-fdc5.up.railway.app/api/delver/accept-order',
          {
            clientName: order.clientName,
            clientPhone: order.clientPhone,
            email: order.email,
            delverName,
            delverEmail,
            latitude: location.latitude,
            longitude: location.longitude
          }
        );
        Alert.alert('✅ تم قبول الطلب');
      }

      setOrders(prev =>
        prev.map(o =>
          o.id === order.id ? { ...o, accepted: true } : o
        )
      );
    } catch {
      Alert.alert('❌ فشل العملية');
    }
  };

  const deliverOrder = order => {
    if (!order.accepted) {
      Alert.alert(
        '⚠️ يجب قبول الطلب أولاً قبل التسليم'
      );
      return;
    }

    setOrders(prev =>
      prev.map(o =>
        o.id === order.id ? { ...o, delivered: true } : o
      )
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
      <Text style={styles.header}>📲 تطبيق المندوب</Text>

      {orders.length === 0 && <Text>لا يوجد طلبات</Text>}

      {orders.map(order => (
        <View
          key={order.id}
          style={[
            styles.clientCard,
            order.accepted && { backgroundColor: '#d1fae5' }
          ]}
        >
          <Text style={{ fontWeight: 'bold' }}>
            👤 {order.clientName}
          </Text>
          <Text>📞 {order.clientPhone}</Text>
          <Text>💰 {order.totalPrice} IQD</Text>

          <TouchableOpacity
            style={styles.mapButton}
            onPress={() =>
              openGoogleMaps(order.clientName)
            }
          >
            <Text style={styles.mapButtonText}>
              📍 الموقع
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.callButton}
            onPress={() =>
              callClient(order.clientPhone)
            }
          >
            <Text style={styles.callButtonText}>
              📞 اتصال
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.doneButton,
              order.accepted && {
                backgroundColor: '#22c55e'
              }
            ]}
            onPress={() => acceptOrder(order)}
          >
            <Text style={styles.doneButtonText}>
              {order.accepted
                ? '✅ تم قبول الطلب'
                : '📦 قبول الطلب'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  clientCard: {
    backgroundColor: '#ddd',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15
  },
  mapButton: {
    backgroundColor: '#1e90ff',
    padding: 10,
    borderRadius: 8,
    marginTop: 8
  },
  mapButtonText: { color: '#fff' },
  callButton: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 8,
    marginTop: 8
  },
  callButtonText: { color: '#fff' },
  doneButton: {
    backgroundColor: '#ff9800',
    padding: 12,
    borderRadius: 8,
    marginTop: 8
  },
  doneButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
