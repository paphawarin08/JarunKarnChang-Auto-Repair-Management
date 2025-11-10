// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import HomePage from './pages/HomePage';
import CompanyProfile from './pages/CompanyProfile';

import CustomerPage from './pages/customer/CustomerPage';
import CustomerImportPage from './pages/customer/CustomerImportPage';

import AppointmentCalendar from './pages/appointments/AppointmentCalendar';
import CarPage from './pages/CarPage';

import EmployeePage from './pages/employee/EmployeePage';
import EmployeeImportPage from './pages/employee/EmployeeImportPage';

import DashboardPage from './pages/DashboardPage';

import UserCheckPage from './pages/UserCheckPage';
import UserMainPage from './pages/UserHomePage';
import User from './pages/User';

import ReportPage from './pages/ReportPage';

import RepairPage from './pages/repair/RepairPage';
import RepairCreatePage from './pages/repair/RepairCreatePage';
import RepairEditPage from "./pages/repair/RepairEditPage";

import SelectCustomer from './pages/SelectCustomer';
import SelectVehicle from './pages/SelectVehicle';

import TechHomePage from './pages/staff/TechHomePage';
import RepairInfoPage from './pages/staff/RepairInfoPage';
import TechRepairEditPage from './pages/staff/TechRepairEditPage';

import PartCategoriesPage from './pages/inventory/PartCategoriesPage';
import PartsListPage from './pages/inventory/PartsListPage';

import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './hooks/useAuth';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* public */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="/usercheck" element={<UserCheckPage />} />
          <Route path="/user" element={<User />} />
          <Route path="/userhomepage" element={<UserMainPage />} />

          {/* admin only */}
          <Route
            path="/admin/home"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/company-profile"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CompanyProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CustomerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers/import_customer"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CustomerImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/appointment-calendar"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppointmentCalendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cars"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <CarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <EmployeePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees/import"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <EmployeeImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/inventory/part-categories"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PartCategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/parts"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PartCategoriesPage />
              </ProtectedRoute>
            }
          />


          <Route
            path="/admin/parts/:categoryId"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PartsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/repairs"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RepairPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/repairs/new"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RepairCreatePage />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin/repairs/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RepairEditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/repairs/select-customer"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SelectCustomer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/repairs/select-vehicle"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SelectVehicle />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* staff (ถ้าต้องการคุมสิทธิ์ในอนาคต เพิ่ม allowedRoles={['staff','admin']} ได้) */}
          <Route path="/staff/home" element={<TechHomePage />} />
          <Route
            path="/tech/repairs/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['staff','admin']}>
                <TechRepairEditPage />
              </ProtectedRoute>
            }
          />
          <Route path="/staff/repair-info" element={<RepairInfoPage />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
