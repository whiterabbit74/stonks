// Simple test to check if strategies are loading correctly
import { STRATEGY_TEMPLATES } from './src/lib/strategy.ts';

console.log('Number of strategy templates:', STRATEGY_TEMPLATES.length);
console.log('Strategy names:');
STRATEGY_TEMPLATES.forEach((template, index) => {
  console.log(`${index + 1}. ${template.name} (${template.category})`);
});

console.log('\nFirst strategy details:');
console.log(JSON.stringify(STRATEGY_TEMPLATES[0], null, 2));