// Tipos y esquemas Zod compartidos entre API y web.
// Aquí encajan: estados del lead, esquema de configuración de pesos, DTOs de la API...

type CriterionKey = 'newCustomer' | 'interest' | 'source' | 'age';
type WeightsConfig = Record<CriterionKey, number>;


export { };
