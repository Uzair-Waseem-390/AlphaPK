import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants, staggerVariants } from './style';
import './App.css';

function App() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100"
      >
        <div className="container mx-auto px-4 py-16">
          <motion.div
            variants={staggerVariants}
            initial="initial"
            animate="animate"
            className="max-w-4xl mx-auto"
          >
            {/* Hero Section */}
            <motion.div
              variants={staggerVariants}
              className="text-center mb-16"
            >
              <motion.div
                variants={staggerVariants}
                className="inline-block mb-4 px-4 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
              >
                🚀 Enterprise Ready
              </motion.div>

              <motion.h1
                variants={staggerVariants}
                className="text-5xl md:text-6xl font-bold text-neutral-900 mb-6"
              >
                Welcome to{' '}
                <span className="text-gradient">
                  ERP System
                </span>
              </motion.h1>

              <motion.p
                variants={staggerVariants}
                className="text-xl text-neutral-600 max-w-2xl mx-auto"
              >
                Experience the future of enterprise management with our cutting-edge platform
              </motion.p>

              <motion.div
                variants={staggerVariants}
                className="mt-8 flex flex-wrap justify-center gap-4"
              >
                <button className="btn-primary">
                  Get Started
                </button>
                <button className="btn-secondary">
                  Learn More
                </button>
              </motion.div>
            </motion.div>

            {/* Feature Cards */}
            <motion.div
              variants={staggerVariants}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  variants={staggerVariants}
                  whileHover={{ y: -8, transition: { duration: 0.3 } }}
                  className="card"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-2xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-neutral-600 text-sm">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>

            {/* Status Section */}
            <motion.div
              variants={staggerVariants}
              className="mt-16 p-8 card"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500">System Status</h3>
                  <p className="text-lg font-semibold text-neutral-900">All Systems Operational</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm text-neutral-600">Live</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const features = [
  {
    icon: '📊',
    title: 'Analytics Dashboard',
    description: 'Real-time insights and comprehensive analytics for your business'
  },
  {
    icon: '🔒',
    title: 'Secure Platform',
    description: 'Enterprise-grade security with advanced encryption and authentication'
  },
  {
    icon: '⚡',
    title: 'Lightning Fast',
    description: 'Optimized performance with instant responses and smooth interactions'
  }
];

export default App;