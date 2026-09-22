import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import UserLogin from "../Component/UserLogin";
import AdminLogin from "../Component/AdminLogin";
import AdminDashboard from "../Component/AdminDashboard";
import UserDashboard from "../Component/UserDashboard";


export const AppRouter = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
//   {
//     path: "/logout",
//     element: <LogoutPage />,
//   },
  
  {
    path: "/login",
    element: <UserLogin/>,


    
  },
  {
    path: "/adminlogin",
    element: <AdminLogin/>,
    

    
  },
  {
    path: "/admin/dashboard",
    element: <AdminDashboard/>,
    

    
  },
  {
    path: "/User/dashboard",
    element: <UserDashboard/>,
    

    
  },
 
]);