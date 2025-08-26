import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ErrorResponseSchema, UserSchema } from './auth.schema';
import { UserRole } from '../types';


export const FranchiseAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullname: z.string(), // Full name of franchise owner
  city:z.string(),
  phonenumber: z.string().nullable(),
  gst_number: z.string().nullable(), // GST number (optional)
  gst_document: z.string().nullable(), // GST document file path/URL
  identity_proof: z.array(z.string()), // Identity proof documents (Aadhar/PAN) - array of image URLs
  geoPolygon: z.any(), // GeoJSON
  ownerId: z.string().optional().nullable(),
  isCompanyManaged: z.boolean(),
  franchiseType: z.enum(['BOUGHT', 'MANAGED', 'COMPANY_MANAGED']),
  createdAt: z.string(),
  isActive: z.boolean(),
  ownerName: z.string(),
  revenue:z.string(),
  serviceAgentCount:z.string()
});

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

//-------------------------------------------------------------------
//-------------------------------------------------------------------

 
export const UpdateFranchiseAreaParamsSchema = z.object({
    id: z.string(),
  });

  export const AssignFranchiseOwnerParamsSchema = z.object({
    id: z.string(),
  });

  export const GetAllFranchiseAreasQuerySchema = z.object({
    isActive: z.boolean().optional(),
  });


  export const GetFranchiseAreaByIdParamsSchema = z.object({
    id: z.string(),
  });

  export const AssignServiceAgentParamsSchema = z.object({
    id: z.string(),
  });

  export const AssignServiceAgentBodySchema = z.object({
    agentId: z.string(),
  });
  
  
 
  export const GetServiceAgentsParamsSchema = z.object({
    id: z.string(),
  });

  export const UpdateFranchiseStatusParamsSchema = z.object({
    id: z.string(),
  });

  export const UpdateFranchiseStatusBodySchema = z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']),
    isActive: z.boolean().optional(),
    reason: z.string().optional(), // Optional reason for status change
  });

  export const UpdateFranchiseStatusResponseSchema = z.object({
    message: z.string(),
    franchise: z.any(), // You can define a more specific type if needed
    previousStatus: z.object({
      isActive: z.boolean(),
    }),
    newStatus: z.object({
      status: z.string(),
      isActive: z.boolean(),
    }),
    reason: z.string().nullable(),
  });

  export const updateFranchiseStatusSchema = {
    params: zodToJsonSchema(UpdateFranchiseStatusParamsSchema),
    body: zodToJsonSchema(UpdateFranchiseStatusBodySchema),
    response: {
      200: zodToJsonSchema(UpdateFranchiseStatusResponseSchema),
      400: zodToJsonSchema(ErrorResponseSchema),
      404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Update franchise status",
    description: "Update the status of a franchise area (admin only)",
    security: [{ bearerAuth: [] }],
  };
//-------------------------------------------------------------------
//-------------------------------------------------------------------




const CreateFranchiseAreaBodySchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    fullname: z.string().min(2, 'Full name must be at least 2 characters'),
    city: z.string().min(2, 'City must be at least 2 characters'),
    phonenumber: z.string().min(10, 'Phone number must be at least 10 digits').optional(),
    gst_number: z.string().optional(), // GST number (optional)
    gst_document: z.string().optional(), // GST document file path/URL
    identity_proof: z.array(z.string()).optional(), // Identity proof documents (Aadhar/PAN) - array of image URLs
    geoPolygon: z
      .array(coordinateSchema)
      .min(4, 'GeoPolygon must have at least 3 coordinates to form a valid area').optional(),
    phoneNumber: z.string().optional(), // Keep for backward compatibility
    franchiseType: z.enum(['BOUGHT', 'MANAGED', 'COMPANY_MANAGED']).default('COMPANY_MANAGED'),
  }).refine((data) => {
    // Validation based on franchise type
    switch (data.franchiseType) {
      case 'BOUGHT':
        // Bought franchises need phone, GST, and identity proof
        if (!data.phonenumber) {
          return false;
        }
        if (!data.gst_number) {
          return false;
        }
        if (!data.identity_proof || data.identity_proof.length === 0) {
          return false;
        }
        break;
      case 'MANAGED':
        // Managed franchises need phone and identity proof, but no GST
        if (!data.phonenumber) {
          return false;
        }
        if (!data.identity_proof || data.identity_proof.length === 0) {
          return false;
        }
        break;
      case 'COMPANY_MANAGED':
        // Company managed franchises need nothing
        break;
    }
    return true;
  }, {
    message: "Required fields missing for the selected franchise type",
    path: ["franchiseType"]
  });

  export const AssignFranchiseOwnerBodySchema = z.object({
    ownerId: z.string(),
  });

  //-------------------------------------------------------------------
//-------------------------------------------------------------------



const CreateFranchiseAreaResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullname: z.string(),
  city: z.string(),
  phonenumber: z.string().nullable(),
  gst_number: z.string().nullable(),
  gst_document: z.string().nullable(),
  identity_proof: z.array(z.string()),
  isCompanyManaged: z.boolean(),
  franchiseType: z.enum(['BOUGHT', 'MANAGED', 'COMPANY_MANAGED']),
});


export const UpdateFranchiseAreaResponseSchema = z.object({
    message: z.string(),
    franchiseArea: FranchiseAreaSchema,
  });



export const GetAllFranchiseAreasResponseSchema = z.object({
    franchiseAreas: z.array(FranchiseAreaSchema),
  });



export const GetFranchiseAreaByIdResponseSchema = z.object({
    franchiseArea: FranchiseAreaSchema.extend({
        phoneNumber:z.string().nullable()
    }),
  });
 

  export const AssignFranchiseOwnerResponseSchema = z.object({
    message: z.string(),
    franchiseArea: FranchiseAreaSchema,
  });


export const GetServiceAgentsResponseSchema = z.object({
    agents: z.array(UserSchema),
  });
  
  export const AssignServiceAgentResponseSchema = z.object({
      message: z.string(),
      agent: UserSchema,
    });
    

//-------------------------------------------------------------------
//-------------------------------------------------------------------


export const createFranchiseAreaSchema = {
    body: zodToJsonSchema(CreateFranchiseAreaBodySchema),
    response: {
      201: zodToJsonSchema(CreateFranchiseAreaResponseSchema),
      400: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Create a new franchise area",
    description: "Create a new franchise area (admin only)",
    security: [{ bearerAuth: [] }],
  };

  
  export const getAllFranchiseAreasSchema = {
    querystring: zodToJsonSchema(GetAllFranchiseAreasQuerySchema),
    response: {
      // 200: zodToJsonSchema(GetAllFranchiseAreasResponseSchema),
      400: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Get all franchise areas",
    description: "Get a list of all franchise areas",
    security: [{ bearerAuth: [] }],
  };

  export const getFranchiseAreaByIdSchema = {
    params: zodToJsonSchema(GetFranchiseAreaByIdParamsSchema),
    response: {
      200: zodToJsonSchema(GetFranchiseAreaByIdResponseSchema),
      404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Get franchise area by ID",
    description: "Get a franchise area by its ID",
    security: [{ bearerAuth: [] }],
  };

  export const UpdateFranchiseAreaBodySchema = z.object({
    name: z.string().min(3).optional(),
    fullname: z.string().min(2).optional(),
    city: z.string().min(2).optional(),
    phonenumber: z.string().min(10).optional(),
    gst_number: z.string().optional(),
    gst_document: z.string().optional(),
    identity_proof: z.array(z.string()).optional(),
    description: z.string().optional(),
    geoPolygon: z.any().optional(),
    isCompanyManaged: z.boolean().optional(),
    isActive: z.boolean().optional(),
    phoneNumber:z.string().optional(), // Keep for backward compatibility
    franchiseType: z.enum(['BOUGHT', 'MANAGED', 'COMPANY_MANAGED']).optional(),
  }).refine((data) => {
    // Validation based on franchise type (only if franchiseType is being changed)
    if (data.franchiseType) {
      switch (data.franchiseType) {
        case 'BOUGHT':
          // Bought franchises need phone, GST, and identity proof
          if (!data.phonenumber) {
            return false;
          }
          if (!data.gst_number) {
            return false;
          }
          if (!data.identity_proof || data.identity_proof.length === 0) {
            return false;
          }
          break;
        case 'MANAGED':
          // Managed franchises need phone and identity proof, but no GST
          if (!data.phonenumber) {
            return false;
          }
          if (!data.identity_proof || data.identity_proof.length === 0) {
            return false;
          }
          break;
        case 'COMPANY_MANAGED':
          // Company managed franchises need nothing
          break;
      }
    }
    return true;
  }, {
    message: "Required fields missing for the selected franchise type",
    path: ["franchiseType"]
  });




export const updateFranchiseAreaSchema = {
  params: zodToJsonSchema(UpdateFranchiseAreaParamsSchema),
  body: zodToJsonSchema(UpdateFranchiseAreaBodySchema),
  response: {
    200: zodToJsonSchema(UpdateFranchiseAreaResponseSchema),
    400: zodToJsonSchema(ErrorResponseSchema),
    404: zodToJsonSchema(ErrorResponseSchema),
  },
  tags: ["franchise-areas"],
  summary: "Update a franchise area",
  description: "Update an existing franchise area (admin only)",
  security: [{ bearerAuth: [] }],
};

export const getServiceAgentsSchema = {
    params: zodToJsonSchema(GetServiceAgentsParamsSchema),
    response: {
      200: zodToJsonSchema(GetServiceAgentsResponseSchema),
      404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Get service agents for franchise area",
    description: "Get all service agents assigned to a franchise area",
    security: [{ bearerAuth: [] }],
  }; 

  export const assignServiceAgentSchema = {
    params: zodToJsonSchema(AssignServiceAgentParamsSchema),
    body: zodToJsonSchema(AssignServiceAgentBodySchema),
    response: {
      200: zodToJsonSchema(AssignServiceAgentResponseSchema),
      400: zodToJsonSchema(ErrorResponseSchema),
      404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["franchise-areas"],
    summary: "Assign service agent",
    description: "Assign a service agent to a franchise area (admin or franchise owner only)",
    security: [{ bearerAuth: [] }],
  };



export const assignFranchiseOwnerSchema = {
  params: zodToJsonSchema(AssignFranchiseOwnerParamsSchema),
  body: zodToJsonSchema(AssignFranchiseOwnerBodySchema),
  response: {
    200: zodToJsonSchema(AssignFranchiseOwnerResponseSchema),
    400: zodToJsonSchema(ErrorResponseSchema),
    404: zodToJsonSchema(ErrorResponseSchema),
  },
  tags: ["franchise-areas"],
  summary: "Assign franchise owner",
  description: "Assign a franchise owner to a franchise area (admin only)",
  security: [{ bearerAuth: [] }],
};



