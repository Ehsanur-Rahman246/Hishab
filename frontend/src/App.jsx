import AppRoutes from '@/AppRoutes'
import AiAssistant from './pages/AiAssistant'

const App = () => {
  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* <AppRoutes /> add this line */}
       <AiAssistant/> {/*remove this line */}
    </div>
  )
}

export default App
