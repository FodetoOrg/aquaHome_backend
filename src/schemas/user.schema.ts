import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Customer schema for admin view
export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phoneNumber: z.string(),
  status: z.string(),
  totalInstallRequests: z.number(),
  subscriptionsCount: z.number(),
  serviceRequestCount: z.number(),
  joinedToPlatform: z.string(),
  city: z.string()
});

// Pagination schema
export const PaginationSchema = z.object({
  limit: z.number().nullable(),
  offset: z.number().nullable(),
  hasMore: z.boolean()
});

// Response schema for getting all customers
export const GetAllCustomersResponseSchema = z.object({
  success: z.boolean(),
  customers: z.array(CustomerSchema),
  totalCount: z.number(),
  pagination: PaginationSchema
});

// Query parameters schema
export const GetAllCustomersQuerySchema = z.object({
  search: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).optional()
});

// Schema for the API endpoint
export const getAllCustomersSchema = {
  querystring: zodToJsonSchema(GetAllCustomersQuerySchema),
  response: {
    200: zodToJsonSchema(GetAllCustomersResponseSchema),
    400: zodToJsonSchema(z.object({
      statusCode: z.number(),
      error: z.string(),
      message: z.string()
    })),
    401: zodToJsonSchema(z.object({
      statusCode: z.number(),
      error: z.string(),
      message: z.string()
    })),
    403: zodToJsonSchema(z.object({
      statusCode: z.number(),
      error: z.string(),
      message: z.string()
    }))
  },
  tags: ["users"],
  summary: "Get all customers for admin",
  description: "Get a list of all customers with their statistics (admin only). Supports filtering, search, and pagination.",
  security: [{ bearerAuth: [] }],
};

export const getProfileDetailsSchema = {
    response: {
        200: zodToJsonSchema(z.object({
            success: z.boolean(),
            data: z.object({
                user: z.object({
                    id: z.string(),
                    name: z.string().nullable(),
                    phone: z.string(),
                    alternativePhone: z.string().nullable(),
                    city: z.string().nullable(),
                    role: z.string(),
                    hasOnboarded: z.boolean(),
                    isActive: z.boolean(),
                    createdAt: z.string(),
                    updatedAt: z.string()
                }),
                profile: z.object({
                    type: z.enum(['ADMIN', 'FRANCHISE_OWNER', 'SERVICE_AGENT']),
                    // Admin profile fields
                    totalFranchises: z.number().optional(),
                    totalAgents: z.number().optional(),
                    totalCustomers: z.number().optional(),
                    totalRevenue: z.number().optional(),
                    permissions: z.array(z.string()).optional(),
                    // Franchise owner profile fields
                    franchise: z.object({
                        id: z.string(),
                        name: z.string(),
                        fullname: z.string(),
                        city: z.string(),
                        franchiseType: z.string(),
                        isActive: z.boolean(),
                        totalAgents: z.number(),
                        totalCustomers: z.number(),
                        totalRevenue: z.number(),
                        createdAt: z.string()
                    }).optional(),
                    // Service agent profile fields
                    assignments: z.array(z.object({
                        franchiseId: z.string(),
                        franchiseName: z.string(),
                        franchiseCity: z.string(),
                        isPrimary: z.boolean(),
                        isActive: z.boolean(),
                        assignedDate: z.string()
                    })).optional(),
                    statistics: z.object({
                        totalRequests: z.number(),
                        completedRequests: z.number(),
                        pendingRequests: z.number(),
                        completionRate: z.number()
                    }).optional()
                })
            })
        })),
        400: zodToJsonSchema(z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string()
        })),
        401: zodToJsonSchema(z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string()
        })),
        404: zodToJsonSchema(z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string()
        }))
    },
    tags: ["Profile"],
    summary: "Get user profile details",
    description: "Get comprehensive profile details for admin, franchise owner, or service agent",
    security: [{ bearerAuth: [] }]
};
