// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function LoadingScreen() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>
      กำลังโหลด...
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading || user === undefined) return <LoadingScreen />;

  // ยังไม่ล็อกอิน → กลับไปหน้า Login
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;

  // มีการกำหนด allowedRoles และ role ไม่อยู่ในรายการ → เตะออก
  if (allowedRoles && !allowedRoles.includes(role)) {
    // ถ้าเป็นช่าง ส่งกลับหน้า staff, ถ้าไม่รู้ role ส่งหน้าแรก
    return <Navigate to={role === "staff" ? "/staff/home" : "/"} replace />;
  }

  return children;
}
