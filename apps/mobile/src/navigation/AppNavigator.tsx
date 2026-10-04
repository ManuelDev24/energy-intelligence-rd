import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, type ComponentProps } from 'react';

import { useAlerts } from '../api/hooks';
import { Loading } from '../components/ui';
import { AlertsScreen, unreadCount } from '../screens/AlertsScreen';
import { BillFormScreen } from '../screens/BillFormScreen';
import { BillsScreen } from '../screens/BillsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EquipmentFormScreen } from '../screens/EquipmentFormScreen';
import { EquipmentScreen } from '../screens/EquipmentScreen';
import { HomesScreen } from '../screens/HomesScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useSession } from '../store/session';
import { colors } from '../theme';

export type RootStackParams = {
  Tabs: undefined;
  BillForm: undefined;
  EquipmentForm: { equipmentId?: string } | undefined;
};
export type TabParams = { Dashboard: undefined; Bills: undefined; Equipment: undefined; Alerts: undefined; Homes: undefined };

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

type IconName = ComponentProps<typeof Ionicons>['name'];
const TAB_ICONS: Record<keyof TabParams, [IconName, IconName]> = {
  Dashboard: ['home', 'home-outline'],
  Bills: ['receipt', 'receipt-outline'],
  Equipment: ['flash', 'flash-outline'],
  Alerts: ['notifications', 'notifications-outline'],
  Homes: ['business', 'business-outline'],
};

function Tabs({ navigation }: NativeStackScreenProps<RootStackParams, 'Tabs'>) {
  const homeId = useSession((st) => st.selectedHomeId);
  const unread = unreadCount(useAlerts(homeId).data);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        headerTitleAlign: 'center',
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" options={{ title: 'Inicio' }} component={DashboardScreen} />
      <Tab.Screen name="Bills" options={{ title: 'Facturas' }}>
        {() => <BillsScreen onAdd={() => navigation.navigate('BillForm')} />}
      </Tab.Screen>
      <Tab.Screen name="Equipment" options={{ title: 'Equipos' }}>
        {() => (
          <EquipmentScreen
            onAdd={() => navigation.navigate('EquipmentForm')}
            onEdit={(equipmentId) => navigation.navigate('EquipmentForm', { equipmentId })}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Alertas', tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tab.Screen name="Homes" options={{ title: 'Viviendas' }} component={HomesScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const hydrated = useSession((st) => st.hydrated);
  const onboardingDone = useSession((st) => st.onboardingDone);
  const hydrate = useSession((st) => st.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading label="Iniciando…" />;
  if (!onboardingDone) return <OnboardingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="BillForm" options={{ title: 'Nueva factura' }}>
          {({ navigation }) => <BillFormScreen onDone={() => navigation.goBack()} />}
        </Stack.Screen>
        <Stack.Screen
          name="EquipmentForm"
          options={({ route }) => ({ title: route.params?.equipmentId ? 'Editar equipo' : 'Nuevo equipo' })}
        >
          {({ navigation, route }) => (
            <EquipmentFormScreen equipmentId={route.params?.equipmentId} onDone={() => navigation.goBack()} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
