import './utils/browserCompatibility.js'
import ReactDOM from 'react-dom/client'
import RootRouter from './RootRouter.jsx'
import './index.css'
import './mobile.css'
import './pwa/pwa.css'
import PwaInstallManager from './components/PwaInstallManager.jsx'
import { initializeInstall } from './pwa/install.js'

initializeInstall({ registerWorker: import.meta.env.PROD })

ReactDOM.createRoot(document.getElementById('root')).render(
  <><RootRouter /><PwaInstallManager /></>
)
