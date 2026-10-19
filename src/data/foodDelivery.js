import { makeCommerceProject } from './commerce.js';
import { validateProject } from '../types/schema.ts';

export const FOOD_DELIVERY_DEMO_COMMAND = 'Keep PostgreSQL as the source of truth and add rate limiting to the authentication endpoint.';

export function makeFoodDeliveryProject() {
  const project = makeCommerceProject();
  project.name = 'Food Delivery Platform';
  project.components = project.components.map((component) => {
    const replacements = {
      web: ['Customer, restaurant, and courier apps', 'Delivery clients'],
      gateway: ['Delivery API Gateway', 'Routing · TLS · auth'],
      auth: ['Identity Service', 'Login · access tokens'],
      catalog: ['Restaurant Service', 'Menus · availability'],
      orders: ['Order Service', 'Checkout · order state'],
      redis: ['Redis', 'Session cache'],
      postgres: ['PostgreSQL', 'Orders and account records'],
      kafka: ['Kafka', 'Order and delivery events'],
      payment: ['Payment Provider', 'External payment integration'],
    };
    if (component.id === 'catalog') component.responsibilities = ['Publishes restaurant profiles, menus, and current availability.'];
    if (component.id === 'orders') component.responsibilities = ['Creates customer orders and coordinates payment, courier assignment, and status updates.'];
    if (component.id === 'payment') component.responsibilities = ['Represents the external payment processor.'];
    const [name, sub] = replacements[component.id] || [component.name, component.sub];
    return { ...component, name, sub };
  });

  project.components.push(
    { id: 'couriers', name: 'Courier Service', type: 'SERVICE', x: 424, y: 346, sub: 'Assignment · location', responsibilities: ['Assigns available couriers and tracks delivery progress.'] },
    { id: 'notifications', name: 'Notification Service', type: 'SERVICE', x: 650, y: 386, sub: 'SMS · push updates', responsibilities: ['Sends order and delivery status updates to customers and couriers.'] },
  );

  project.relationships = [
    { from: 'web', to: 'gateway', label: 'HTTPS' },
    { from: 'gateway', to: 'auth', label: 'login' },
    { from: 'gateway', to: 'catalog', label: 'restaurant search' },
    { from: 'gateway', to: 'orders', label: 'place order' },
    { from: 'gateway', to: 'couriers', label: 'courier app' },
    { from: 'auth', to: 'redis', label: 'sessions' },
    { from: 'auth', to: 'postgres', label: 'accounts' },
    { from: 'catalog', to: 'postgres', label: 'restaurants and menus' },
    { from: 'orders', to: 'postgres', label: 'orders' },
    { from: 'orders', to: 'kafka', label: 'publish order event' },
    { from: 'kafka', to: 'couriers', label: 'assignment event' },
    { from: 'couriers', to: 'postgres', label: 'delivery status' },
    { from: 'orders', to: 'payment', label: 'payment request' },
    { from: 'orders', to: 'notifications', label: 'status update' },
    { from: 'notifications', to: 'kafka', label: 'delivery events' },
  ];
  project.apiOperations = [
    { id: 'api-auth-login', componentId: 'auth', method: 'post', path: '/auth/login', summary: 'Authenticate a customer or courier' },
    { id: 'api-restaurants-list', componentId: 'catalog', method: 'get', path: '/restaurants', summary: 'List restaurants and menus' },
    { id: 'api-orders-create', componentId: 'orders', method: 'post', path: '/orders', summary: 'Place a food delivery order' },
    { id: 'api-couriers-assign', componentId: 'couriers', method: 'post', path: '/couriers/assignments', summary: 'Assign a courier to an order' },
    { id: 'api-notifications-status', componentId: 'notifications', method: 'get', path: '/orders/{orderId}/updates', summary: 'Read order status updates' },
  ];
  project.requirements = [
    { id: 'REQ-DELIVERY-ASSIGN', text: 'Each confirmed order must be assigned to an available courier.', status: 'confirmed' },
    { id: 'REQ-DELIVERY-STATUS', text: 'Customers can follow order and delivery status updates.', status: 'confirmed' },
    { id: 'REQ-PAYMENT-IDEMPOTENCY', text: 'Payment retries must not create duplicate charges.', status: 'confirmed' },
  ];
  project.baseline = structuredClone({
    name: project.name,
    version: project.version,
    components: project.components,
    relationships: project.relationships,
    apiOperations: project.apiOperations,
    requirements: project.requirements,
  });
  return validateProject(project);
}
