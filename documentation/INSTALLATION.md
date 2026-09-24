# DineIQ Analytics — Installation & Environment Setup Guide

This guide provides step-by-step instructions for setting up the DineIQ Master Repository environment across supported platforms (Windows, Linux, macOS).

---

## 1. System Requirements

- **Operating System**: Windows 10/11, Ubuntu 20.04+, or macOS 12+
- **Python Version**: Python 3.9, 3.10, 3.11, or 3.14+
- **Java Runtime Environment (JRE)**: OpenJDK 17 or JRE 17 (Required for PySpark execution)
- **Apache Spark**: Spark 3.4.0+ / PySpark 3.4.0+ (Included in `requirements.txt`)
- **Memory**: Minimum 8 GB RAM (16 GB recommended for 1M dataset execution)

---

## 2. Environment Setup

### 2.1 Clone Repository & Navigate
```bash
git clone https://github.com/MHamza-9111/Techwizz.git DineIQ-Analytics
cd DineIQ-Analytics
```

### 2.2 Create Virtual Environment
```bash
# On Windows
python -m venv .venv
.venv\Scripts\activate

# On Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
```

### 2.3 Install Python Dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 2.4 Java Setup for PySpark
Verify Java 17 installation:
```bash
java -version
```

If Java is missing, install OpenJDK 17:
```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y openjdk-17-jre-headless

# Windows (via Chocolatey or winget)
winget install Microsoft.OpenJDK.17
```

Automated environment setup script is available at:
```bash
bash setup_spark.sh
```
