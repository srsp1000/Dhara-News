# deploy/terraform/main.tf
# Enterprise AWS infrastructure for Dhara News
# Provisions: EKS, RDS, ElastiCache, CloudFront, S3, Route53, ACM
#
# Usage:
#   cd deploy/terraform
#   terraform init
#   terraform plan -var="environment=production"
#   terraform apply

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket = "dhara-terraform-state"
    key    = "production/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "dhara-news"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region"   { default = "ap-south-1" }   # Mumbai — closest to India
variable "environment"  { default = "production" }
variable "db_password"  { sensitive = true }
variable "domain_name"  { default = "dhara.news" }

# ── VPC ───────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "dhara-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false        # HA NAT for production
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags  = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }
}

# ── EKS Cluster ───────────────────────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "dhara-${var.environment}"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    # General workloads (API, agents)
    general = {
      min_size       = 2
      max_size       = 20
      desired_size   = 3
      instance_types = ["m6i.xlarge"]
      capacity_type  = "SPOT"        # 60-70% cost saving with spot
      disk_size      = 50
      labels         = { workload = "general" }
    }

    # ML/NLP workloads (Ollama, summarization)
    ml = {
      min_size       = 0
      max_size       = 5
      desired_size   = 1
      instance_types = ["m6i.2xlarge", "m6a.2xlarge"]
      capacity_type  = "ON_DEMAND"    # Ollama needs consistent memory
      disk_size      = 100
      labels         = { workload = "ml" }
      taints = [{
        key    = "workload"
        value  = "ml"
        effect = "NO_SCHEDULE"
      }]
    }
  }
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "dhara" {
  name       = "dhara-db-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "dhara" {
  identifier        = "dhara-${var.environment}"
  engine            = "postgres"
  engine_version    = "16.1"
  instance_class    = "db.t4g.medium"   # 2 vCPU, 4GB RAM — ₹3K/month
  allocated_storage = 100
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "dhara"
  username = "dhara"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.dhara.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az               = true          # HA for production
  backup_retention_period = 7
  backup_window           = "02:00-03:00"
  maintenance_window      = "sun:03:00-sun:04:00"
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "dhara-final-${var.environment}"

  performance_insights_enabled = true
  monitoring_interval          = 60

  parameter_group_name = aws_db_parameter_group.dhara.name
}

resource "aws_db_parameter_group" "dhara" {
  name   = "dhara-postgres16"
  family = "postgres16"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pg_trgm"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"    # log queries >1s
  }
  parameter {
    name  = "max_connections"
    value = "200"
  }
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
resource "aws_elasticache_replication_group" "dhara" {
  replication_group_id = "dhara-redis"
  description          = "Dhara News Redis cluster"
  node_type            = "cache.t4g.medium"
  num_node_groups      = 2             # 2 shards
  replicas_per_node_group = 1         # 1 read replica per shard
  engine_version       = "7.1"
  port                 = 6379

  subnet_group_name    = aws_elasticache_subnet_group.dhara.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  automatic_failover_enabled = true
  multi_az_enabled           = true

  snapshot_retention_limit = 3
  snapshot_window          = "03:00-04:00"
}

resource "aws_elasticache_subnet_group" "dhara" {
  name       = "dhara-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

# ── S3 for media/assets ───────────────────────────────────────────────────────
resource "aws_s3_bucket" "dhara_media" {
  bucket = "dhara-media-${var.environment}"
}

resource "aws_s3_bucket_versioning" "dhara_media" {
  bucket = aws_s3_bucket.dhara_media.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "dhara_media" {
  bucket = aws_s3_bucket.dhara_media.id
  rule {
    id     = "move-to-ia"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}

# ── CloudFront CDN ────────────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "dhara" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = ["dhara.news", "www.dhara.news"]
  price_class         = "PriceClass_200"  # US, EU, Asia — covers India

  origin {
    domain_name = "frontend-alb.dhara.internal"
    origin_id   = "dhara-frontend"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "dhara-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 86400
  }

  # API routes — no caching, pass through directly
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "dhara-frontend"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Content-Type"]
      cookies { forward = "all" }
    }
    min_ttl = 0; default_ttl = 0; max_ttl = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.dhara.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/404"
  }
}

# ── ACM Certificate ───────────────────────────────────────────────────────────
resource "aws_acm_certificate" "dhara" {
  provider          = aws.us-east-1    # CloudFront requires us-east-1
  domain_name       = "dhara.news"
  subject_alternative_names = ["*.dhara.news"]
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}

# ── Route 53 ─────────────────────────────────────────────────────────────────
resource "aws_route53_zone" "dhara" {
  name = var.domain_name
}

resource "aws_route53_record" "dhara_apex" {
  zone_id = aws_route53_zone.dhara.zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.dhara.domain_name
    zone_id                = aws_cloudfront_distribution.dhara.hosted_zone_id
    evaluate_target_health = false
  }
}

# ── Security Groups ───────────────────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name   = "dhara-rds-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

resource "aws_security_group" "redis" {
  name   = "dhara-redis-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "eks_cluster_name"       { value = module.eks.cluster_name }
output "eks_cluster_endpoint"   { value = module.eks.cluster_endpoint }
output "rds_endpoint"           { value = aws_db_instance.dhara.endpoint }
output "redis_endpoint"         { value = aws_elasticache_replication_group.dhara.primary_endpoint_address }
output "cloudfront_domain"      { value = aws_cloudfront_distribution.dhara.domain_name }
output "s3_bucket"              { value = aws_s3_bucket.dhara_media.bucket }
