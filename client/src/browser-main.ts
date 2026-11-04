import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import BrowserApp from './BrowserApp.vue';
import { enableBrowserMode } from './lib/browserMediaRegistry';
import 'element-plus/dist/index.css';
import './styles.scss';
import './styles/cluster.scss';

enableBrowserMode();
createApp(BrowserApp).use(ElementPlus).mount('#app');
