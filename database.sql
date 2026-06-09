-- =============================================
-- GradeView Simple — Database Setup
-- Import this in phpMyAdmin
-- =============================================

CREATE DATABASE IF NOT EXISTS grade_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE grade_system;

-- Students & Grades (single table — simple)
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    final_grade DECIMAL(4,2) NOT NULL,
    remarks ENUM('Passed','Failed') NOT NULL DEFAULT 'Passed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    is_active TINYINT(1) DEFAULT 1,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit: who viewed their grades
CREATE TABLE IF NOT EXISTS view_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_number VARCHAR(20) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Default Admin  (password: password)
-- =============================================
INSERT INTO admin_users (username, password, full_name) VALUES
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator');

-- Sample students
INSERT INTO students (student_number, full_name, final_grade, remarks) VALUES
('2024-00001', 'Maria Santos',    1.50, 'Passed'),
('2024-00002', 'Juan dela Cruz',  2.75, 'Passed'),
('2024-00003', 'Ana Reyes',       3.00, 'Passed'),
('2024-00004', 'Pedro Garcia',    5.00, 'Failed');
