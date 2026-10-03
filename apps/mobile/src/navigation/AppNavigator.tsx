import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import { Loading } from '../components/ui';
import { BillFormScreen } from '../screens/BillFormScreen';
import { BillsScreen } from '../screens/BillsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { HomesScreen } from '../screens/HomesScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useSession } from '../store/session';
import { colors } from '../theme';

export type RootStackParams = { Tabs: undefined; BillForm: undefined };
export type TabParams = { Dashboard: undefined; Bills: undefined; Homes: undefined };

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

function Tabs({ navigation }: { navigation: { navigate: (r: 'BillForm') => void } }) {
  return (
    <Tab.Navigator
      screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleAlign: 'center' }}
    >
      <Tab.Screen name="Dashboard" options={{ title: 'Inicio' }} component={DashboardScreen} />
      <Tab.Screen name="Bills" options={{ title: 'Facturas' }}>
        {() => <BillsScreen onAdd={() => navigation.navigate('BillForm')} />}
      </Tab.Screen>
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
        <Stack.Screen name="Tabs" component={Tabs as never} options={{ headerShown: false }} />
        <Stack.Screen name="BillForm" options={{ title: 'Nueva factura' }}>
          {({ navigation }) => <BillFormScreen onDone={() => navigation.goBack()} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
